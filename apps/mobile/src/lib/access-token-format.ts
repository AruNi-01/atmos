/** Re-export device credential length gates from relay-client. */
export {
  isPlausibleDeviceCredential,
  MIN_DEVICE_CREDENTIAL_LEN,
  requireDeviceCredential as requirePlausibleDeviceCredential,
} from "@atmos/relay-client";
