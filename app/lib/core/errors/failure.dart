/// Every failure has a user-facing message. Never show raw exceptions.
sealed class Failure {
  const Failure(this.message);
  final String message;
}

class CameraDenied extends Failure {
  const CameraDenied() : super('Camera permission is needed to scan notes.');
}

class LowConfidence extends Failure {
  const LowConfidence() : super('Could not read this clearly. Try again.');
}

class ModelMissing extends Failure {
  const ModelMissing() : super('The language model is not installed yet.');
}

class ModelLoadFailed extends Failure {
  const ModelLoadFailed() : super('The language model could not start.');
}

class OutOfMemory extends Failure {
  const OutOfMemory() : super('Not enough memory for this action.');
}

class DownloadFailed extends Failure {
  const DownloadFailed() : super('Download failed. You can resume it.');
}

class PackIncompatible extends Failure {
  const PackIncompatible()
      : super('This data pack needs a newer version of the app.');
}

class UnknownFailure extends Failure {
  const UnknownFailure([super.message = 'Something went wrong.']);
}
