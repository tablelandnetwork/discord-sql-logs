import { strictEqual, rejects, throws } from "assert";
import { describe, test } from "mocha";
import { temporaryWrite } from "tempy";
import { Signer, bytesToHex } from "../src/basin";

describe("basin", function () {
  describe("signer", function () {
    const pk =
      "59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
    const signer = new Signer(pk);

    test("should sign bytes", async function () {
      const content = "data to be signed";
      const expectedSignature =
        "6ddb61a19b9df71136b48c80b2e86e7e20313d5eec0de9210802335b300ba8df6c332d35a5d753a028d703769fd9b66d7ce5902d80369750cf55118b1679d84900";
      const signatureBytes = signer.signBytes(content);
      const signature = bytesToHex(signatureBytes);
      strictEqual(signature, expectedSignature);
    });

    test("should sign small file", async function () {
      const content = "data to be signed";
      const expectedSignature =
        "6ddb61a19b9df71136b48c80b2e86e7e20313d5eec0de9210802335b300ba8df6c332d35a5d753a028d703769fd9b66d7ce5902d80369750cf55118b1679d84900";
      const file = await temporaryWrite(content);
      const signatureBytes = await signer.signFile(file);
      const signature = bytesToHex(signatureBytes);
      strictEqual(signature, expectedSignature);
    });

    test("should sign large file", async function () {
      // 10KB of "a", which is larger than the 4KB buffer when reading the file
      const content = Array.from({ length: 10 * 1024 }, () => "a").join("");
      const expectedSignature =
        "9bbeae611691787742fb3426f0410a70fa9c55c96584929b9b2739c0ff0481fd0eb50ea1e6e2d2a3212fbff8c5aa45377309698e1601ba8b2aab49ccc30463b201";
      const file = await temporaryWrite(content);
      const signatureBytes = await signer.signFile(file);
      const signature = bytesToHex(signatureBytes);
      strictEqual(signature, expectedSignature);
    });

    test("should not sign empty bytes", async function () {
      throws(
        () => {
          signer.signBytes("");
        },
        (err: any) => {
          strictEqual(err.message, "error with data: content is empty");
          return true;
        }
      );
    });

    test("should not sign empty file", async function () {
      await rejects(
        async () => {
          const file = await temporaryWrite("");
          await signer.signFile(file);
        },
        (err: any) => {
          strictEqual(err.message, "error with file: content is empty");
          return true;
        }
      );
    });
  });
});
