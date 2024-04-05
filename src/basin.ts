import {
  createReadStream,
  createWriteStream,
  statSync,
  readFileSync,
} from "fs";
import { basename } from "path";
import { WritableStream } from "stream/web";
import { type Hasher } from "js-sha3";
import sha3 from "js-sha3";
import {
  bufferToHex,
  ecsign,
  KECCAK256_NULL_S,
  privateToAddress,
} from "ethereumjs-util";

const { keccak256 } = sha3;

// Signer class to sign files and data
export class Signer {
  private readonly privateKey: Buffer;
  private state: Hasher;

  constructor(privateKey: string) {
    this.privateKey = Buffer.from(privateKey, "hex");
    this.state = keccak256.create();
  }

  // Reset the hash state
  private resetState(): void {
    this.state = keccak256.create();
  }

  // Sum chunks of data to the internal state
  private sum(chunk: string | Buffer): void {
    if (typeof chunk === "string") {
      this.state.update(Buffer.from(chunk));
    } else {
      this.state.update(chunk);
    }
  }

  // Signs the internal state
  private sign(): Uint8Array {
    if (this.state.hex() === KECCAK256_NULL_S) {
      throw new Error("state is not initialized");
    }
    const msg = Buffer.from(this.state.hex(), "hex");
    this.resetState(); // Reset the hash state after use
    const ecdsaSignature = ecsign(msg, this.privateKey, 0x00);
    const { r, s, v: vRawValue } = ecdsaSignature;
    // Note: EIP-155 is not used(?) in `go-ethereum` package, so `1b` and `1c`
    // must be adjusted to `00` and `01` respectively to match the Basin
    // `pkg/signing` library
    const vConvertedValue = vRawValue === 0x1b ? 0x00 : 0x01;
    const v = Buffer.from([vConvertedValue]);
    const signatureBuffer = Buffer.concat([r, s, v]);

    return new Uint8Array(signatureBuffer);
  }

  // Signs a file in chunks
  async signFile(filepath: string): Promise<Uint8Array> {
    const file = statSync(filepath);
    if (!file.isFile()) {
      throw new Error("file does not exist: " + filepath);
    }
    if (file.size === 0) {
      throw new Error("error with file: content is empty");
    }
    this.resetState();
    return await new Promise((resolve, reject) => {
      const stream = createReadStream(filepath, { highWaterMark: 4 * 1024 }); // 4KB buffer
      stream.on("data", (chunk: Buffer) => {
        this.sum(chunk);
      });
      stream.on("error", (err) => {
        reject(err);
      });
      stream.on("end", () => {
        resolve(this.sign());
      });
    });
  }

  // Signs the internal state after all chunks have been added
  signBytes(data: string | Buffer): Uint8Array {
    if (data.length === 0) {
      throw new Error("error with data: content is empty");
    }
    this.sum(data);

    return this.sign();
  }

  address(): string {
    return privateToAddress(this.privateKey).toString("hex");
  }
}

// Get base URL for API in dev or production
export function getBaseUrl(env?: string): string {
  if (env === "dev") {
    return "http://localhost:8080";
  } else {
    return "https://basin.tableland.xyz";
  }
}

// Create a new vault
export async function createVault(
  name: string,
  account: string,
  cache?: number
): Promise<void> {
  const baseUrl = getBaseUrl();
  const params = new URLSearchParams();
  params.append("account", account);
  if (cache !== undefined) params.append("cache", cache.toString());
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  const url = `${baseUrl}/vaults/${name}`;
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: params,
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `HTTP error: ${response.status} ${response.statusText} - ${errorBody}`
    );
  }

  const data = await response.json();
  const isCreated = data.created;
  if (isCreated === false) {
    throw new Error("error creating vault");
  }
}

// Write a file to a vault
export async function writeFileToVault(
  vault: string,
  filepath: string,
  signature: string
): Promise<void> {
  const fileExists = statSync(filepath);
  if (!fileExists.isFile()) {
    throw new Error("file does not exist: " + filepath);
  }
  const baseUrl = getBaseUrl();
  const timestamp = Math.floor(new Date().getTime() / 1000);
  const params = new URLSearchParams();
  params.append("timestamp", timestamp.toString());
  params.append("signature", signature);
  const filename = basename(filepath);
  const headers = {
    filename,
  };
  const fileData = readFileSync(filepath);
  const url = `${baseUrl}/vaults/${vault}/events?${params.toString()}`;
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: fileData,
  });
  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
  }

  // Response is just `[]` if successful
  const data = await response.json();
  if (data.length !== 0) {
    throw new Error("error writing file to vault");
  }
}

// Get the vault for an account address
export async function getVaults(account: string): Promise<string[]> {
  let retries = 5;
  let timeout = 1000;
  let lastError = null;

  while (retries > 0) {
    try {
      const baseUrl = getBaseUrl();
      const params = new URLSearchParams();
      params.append("account", account);
      const url = `${baseUrl}/vaults?${params.toString()}`;
      const response = await fetch(url);
      if (response.ok) {
        return await response.json();
      } else {
        let errorBody;
        try {
          errorBody = await response.json();
        } catch (error) {
          errorBody = { error: "non-JSON error response" };
        }
        // Track errors for retry or final throw
        lastError = new Error(
          `HTTP error: ${response.status} ${response.statusText} - ${JSON.stringify(errorBody)}`
        );
        // Make sure to retry the request if the connection is closed
        // See here for example failure: https://github.com/tablelandnetwork/discord-sql-logs/actions/runs/8562371497/job/23465503410#step:7:20
        if (
          response.status === 400 &&
          errorBody.error !== null &&
          errorBody.error.match(
            /connection closed before message completed/
          ) !== null
        ) {
          // Wait and retry with backoff
          await new Promise((resolve) => setTimeout(resolve, timeout));
          timeout *= 2;
          retries -= 1;
          continue;
        } else {
          throw lastError;
        }
      }
    } catch (err: any) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, timeout));
      timeout *= 2;
      retries -= 1;
    }
  }

  throw lastError;
}

// Check if a vault exists in the list of vaults for an account
export function checkVaultExists(vaults: string[], vault: string): boolean {
  return vaults.includes(vault);
}

// Get the events from a vault
export async function getVaultEvents(
  vault: string,
  options?: {
    latest?: number;
    limit?: number;
    before?: number;
    after?: number;
    at?: number;
  }
): Promise<Array<Record<string, any>>> {
  const baseUrl = getBaseUrl();
  const params = new URLSearchParams();
  if (options !== undefined) {
    for (const [key, value] of Object.entries(options)) {
      if (value !== undefined) {
        params.append(key, value.toString());
      }
    }
  }
  const url = `${baseUrl}/vaults/${vault}/events`;
  const response = await fetch(url);
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `HTTP error: ${response.status} ${response.statusText} - ${errorBody}`
    );
  }

  const data: Array<Record<string, any>> = await response.json();
  return data;
}

// Download a file from a vault event—the `state.db` file from the latest run
export async function downloadStateDbFromEvent(
  cid: string,
  filepath: string
): Promise<void> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/events/${cid}`;
  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) {
      // A 404 likely means the event cache expired and not accessible over API
      throw new Error("event not found or cache expired");
    } else {
      const errorBody = await response.text();
      throw new Error(
        `HTTP error: ${response.status} ${response.statusText} - ${errorBody}`
      );
    }
  }

  const writableStream = new WritableStream({
    async write(chunk) {
      await new Promise((resolve, reject) => {
        const writer = createWriteStream(filepath, { flags: "a" });
        writer.write(chunk, (err) => {
          if (err != null) reject(err);
          else resolve("");
        });
      });
    },
    abort(err) {
      throw new Error(`stream aborted: ${err}`);
    },
  });

  await response.body?.pipeTo(writableStream);
}

// Converts a hex string to a buffer
function stripHexPrefix(hexString: string): string {
  return hexString.startsWith("0x") ? hexString.slice(2) : hexString;
}

// Converts a Uint8array to a hex string
export function bytesToHex(signature: Uint8Array): string {
  const hex = bufferToHex(Buffer.from(signature));
  return stripHexPrefix(hex);
}
