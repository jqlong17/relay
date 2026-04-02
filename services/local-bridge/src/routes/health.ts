function getHealthPayload() {
  return {
    status: "ok",
    service: "local-bridge",
    version: "0.0.1",
  };
}

export { getHealthPayload };
