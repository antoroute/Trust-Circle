const String appEnvironment = String.fromEnvironment('TC_ENVIRONMENT');
const String apiBase = String.fromEnvironment('TC_API_BASE_URL');
const String messagingBase = '$apiBase/api';
const String authBase = '$apiBase/auth';
const String socketBase = apiBase;
const String clientVersion = "2.0.0";

const String stagingApiHost = 'trust-circle.kavalek.fr';

class PublicAppConfigurationException implements Exception {
  const PublicAppConfigurationException(this.reason);

  final String reason;

  @override
  String toString() => 'Invalid public application configuration: $reason';
}

void validatePublicAppConfiguration({
  String environment = appEnvironment,
  String baseUrl = apiBase,
}) {
  if (!const <String>{
    'development',
    'staging',
    'production',
  }.contains(environment)) {
    throw const PublicAppConfigurationException('unknown_environment');
  }

  final uri = Uri.tryParse(baseUrl);
  if (uri == null ||
      !uri.hasScheme ||
      uri.host.isEmpty ||
      uri.hasQuery ||
      uri.hasFragment ||
      uri.userInfo.isNotEmpty ||
      uri.path.isNotEmpty) {
    throw const PublicAppConfigurationException('invalid_api_base_url');
  }

  final isLoopback = const <String>{
    'localhost',
    '127.0.0.1',
    '::1',
  }.contains(uri.host);
  if (uri.scheme != 'https' &&
      !(environment == 'development' && uri.scheme == 'http' && isLoopback)) {
    throw const PublicAppConfigurationException('https_required');
  }

  if (environment == 'staging' && baseUrl != 'https://$stagingApiHost') {
    throw const PublicAppConfigurationException('staging_host_mismatch');
  }
  if (environment == 'production' && uri.host == stagingApiHost) {
    throw const PublicAppConfigurationException('staging_host_in_production');
  }
}

bool get isNonProductionBuild => appEnvironment != 'production';

String get publicAppDisplayName =>
    isNonProductionBuild ? 'CircleHaven [$appEnvironment]' : 'CircleHaven';

const int maxEmailCharacters = 254;
const int maxUsernameCharacters = 64;
const int minPasswordCharacters = 8;
const int maxPasswordCharacters = 1024;
const int maxGroupNameCharacters = 64;
const int maxConversationParticipants = 128;
const int maxMessageRecipients = 256;
const int maxMessagePlaintextBytes = 65520; // 64 Kio moins le tag AES-GCM.
const int maxSocketBatchConversations = 100;

Map<String, String> baseRequestHeaders() => <String, String>{
  'Content-Type': 'application/json',
  'X-Client-Version': clientVersion,
};
