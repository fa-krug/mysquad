import { toast } from "sonner";

export async function copyToClipboard(text: string) {
  await navigator.clipboard.writeText(text);
  toast("Copied to clipboard", { duration: 1500 });
}
