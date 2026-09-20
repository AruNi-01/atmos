import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { signOutThisPhone } from "@/lib/device-credential";
import { clearRelaySecretKey } from "@/lib/relay-secret-key";
import { useComputerStore } from "@/stores/computer-store";
import { useSessionStore } from "@/stores/session-store";

export function useSignOutPhone() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const clearSession = useSessionStore((state) => state.clearSession);
  const setRelaySecretKey = useSessionStore((state) => state.setRelaySecretKey);
  const setComputers = useComputerStore((state) => state.setComputers);

  const signOutPhone = useMutation({
    mutationFn: async () => {
      await signOutThisPhone();
      await clearRelaySecretKey();
    },
    onSuccess: async () => {
      clearSession();
      setRelaySecretKey("");
      setComputers([]);
      await queryClient.invalidateQueries();
      router.replace("/");
    },
  });

  const confirmSignOutPhone = () => {
    Alert.alert(
      "Sign out this phone",
      "Revokes this phone’s Hub device and clears local credentials.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: () => signOutPhone.mutate(),
        },
      ],
    );
  };

  return {
    confirmSignOutPhone,
    error: signOutPhone.error instanceof Error ? signOutPhone.error.message : null,
    isPending: signOutPhone.isPending,
  };
}
