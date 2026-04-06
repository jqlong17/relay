import Foundation

#if canImport(Security)
import Security
#endif

public protocol RelaySupabaseTokenStore: Sendable {
  func loadTokens() async throws -> RelaySupabaseSessionTokens?
  func saveTokens(_ tokens: RelaySupabaseSessionTokens) async throws
  func clearTokens() async throws
}

public actor InMemoryRelaySupabaseTokenStore: RelaySupabaseTokenStore {
  private var tokens: RelaySupabaseSessionTokens?

  public init(tokens: RelaySupabaseSessionTokens? = nil) {
    self.tokens = tokens
  }

  public func loadTokens() async throws -> RelaySupabaseSessionTokens? {
    tokens
  }

  public func saveTokens(_ tokens: RelaySupabaseSessionTokens) async throws {
    self.tokens = tokens
  }

  public func clearTokens() async throws {
    tokens = nil
  }
}

#if canImport(Security)
public actor KeychainRelaySupabaseTokenStore: RelaySupabaseTokenStore {
  private let service: String
  private let account: String

  public init(service: String = "com.relay.ios", account: String = "supabase-session") {
    self.service = service
    self.account = account
  }

  public func loadTokens() async throws -> RelaySupabaseSessionTokens? {
    var query = baseQuery()
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne

    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)

    if status == errSecItemNotFound {
      return nil
    }

    guard status == errSecSuccess else {
      throw RelayTokenStoreError.unexpectedStatus(status)
    }

    guard let data = item as? Data else {
      throw RelayTokenStoreError.invalidPayload
    }

    return try JSONDecoder().decode(RelaySupabaseSessionTokens.self, from: data)
  }

  public func saveTokens(_ tokens: RelaySupabaseSessionTokens) async throws {
    let data = try JSONEncoder().encode(tokens)
    try await clearTokens()

    var query = baseQuery()
    query[kSecValueData as String] = data
    query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

    let status = SecItemAdd(query as CFDictionary, nil)

    guard status == errSecSuccess else {
      throw RelayTokenStoreError.unexpectedStatus(status)
    }
  }

  public func clearTokens() async throws {
    let status = SecItemDelete(baseQuery() as CFDictionary)

    guard status == errSecSuccess || status == errSecItemNotFound else {
      throw RelayTokenStoreError.unexpectedStatus(status)
    }
  }

  private func baseQuery() -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
  }
}

public enum RelayTokenStoreError: Error, Equatable, Sendable {
  case invalidPayload
  case unexpectedStatus(OSStatus)
}
#endif
