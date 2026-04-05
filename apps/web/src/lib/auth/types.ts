type RelayAuthSessionActor = {
  method: "password" | "github" | null;
  provider: "password" | "github" | null;
  userId: string | null;
};

type RelayAuthSessionResponse = {
  authenticated: boolean;
  configured: boolean;
  session: RelayAuthSessionActor | null;
};

export type { RelayAuthSessionActor, RelayAuthSessionResponse };
