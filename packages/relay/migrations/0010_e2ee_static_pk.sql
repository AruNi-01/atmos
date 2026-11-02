-- Computer static X25519 public key advertised over the outbound server WS.
-- Private key stays on the Computer (`~/.atmos/credentials/relay_e2ee.json`).
ALTER TABLE computers ADD COLUMN e2ee_static_pk TEXT;
