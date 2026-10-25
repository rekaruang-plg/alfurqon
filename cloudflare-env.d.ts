declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    TOKEN_VAULT_KEY?: string;
    BUCKET?: R2Bucket;
  }
}
