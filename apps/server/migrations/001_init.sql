-- Web Basket initial schema (spec §6).
-- JSON note: SQL Server 2022 (our dev container) has no native json type, so
-- headers use NVARCHAR(MAX) guarded by ISJSON. Works identically on Azure SQL.

CREATE TABLE baskets (
  id                BIGINT IDENTITY(1,1) PRIMARY KEY,
  address           NVARCHAR(32)  NOT NULL UNIQUE,
  created_at        DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),
  last_activity_at  DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE requests (
  id            BIGINT IDENTITY(1,1) PRIMARY KEY,
  basket_id     BIGINT         NOT NULL
                 REFERENCES baskets(id) ON DELETE CASCADE,
  method        NVARCHAR(16)   NOT NULL,
  path          NVARCHAR(2048) NOT NULL,        -- includes any sub-path suffix
  query         NVARCHAR(MAX)  NULL,            -- raw query string
  headers       NVARCHAR(MAX)  NOT NULL
                 CONSTRAINT ck_requests_headers_json CHECK (ISJSON(headers) = 1),
  body          VARBINARY(MAX) NULL,            -- raw bytes, up to the size cap
  body_size     INT            NOT NULL DEFAULT 0,
  truncated     BIT            NOT NULL DEFAULT 0,
  content_type  NVARCHAR(256)  NULL,
  remote_ip     NVARCHAR(64)   NULL,
  received_at   DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE INDEX ix_requests_basket_received
  ON requests (basket_id, received_at DESC, id DESC);
