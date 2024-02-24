CREATE TABLE IF NOT EXISTS state (
    chain_id INTEGER NOT NULL,
    block_number INTEGER NOT NULL,
    timestamp INTEGER NOT NULL,

    PRIMARY KEY(chain_id, block_number)
);