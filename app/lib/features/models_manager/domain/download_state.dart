import '../../../core/errors/failure.dart';

sealed class DownloadState {
  const DownloadState();
}

class NotInstalled extends DownloadState {
  const NotInstalled();
}

class Queued extends DownloadState {
  const Queued();
}

class Downloading extends DownloadState {
  const Downloading(this.progress);
  final double progress;
}

class Verifying extends DownloadState {
  const Verifying();
}

class Installed extends DownloadState {
  const Installed(this.version);
  final String version;
}

class DownloadError extends DownloadState {
  const DownloadError(this.failure, {this.canResume = true});
  final Failure failure;
  final bool canResume;
}
