/// A: 6 GB+ RAM with working GPU/NPU -> big model.
/// B: ~4 GB or no usable GPU -> small model.
/// C: very old -> templates + keyword search only.
enum DeviceTier { a, b, c }
