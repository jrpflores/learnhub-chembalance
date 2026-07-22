import { SettingsEditor } from "@/components/admin/settings-editor";
import { getSystemSettings } from "@/server/queries/admin";

export default function AdminSettingsPage() {
  const settings = getSystemSettings();
  return <SettingsEditor settings={settings} />;
}
