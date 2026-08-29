import { PageHeader } from "@/components/page-header";
import { AiApiKeySettings } from "@/components/settings/ai-api-key-settings";
import { SettingsForm } from "@/components/settings/settings-form";
import { getAiMetadataStatus } from "@/lib/ai-config";
import { configurationStatus } from "@/lib/config";
import { getEffectiveRepositoryConfig } from "@/lib/settings";

export const metadata = { title: "设置" };

export default async function SettingsPage() {
  const [config, aiStatus] = await Promise.all([
    getEffectiveRepositoryConfig(),
    getAiMetadataStatus(),
  ]);
  const status = configurationStatus();
  return (
    <>
      <PageHeader
        description="配置 AI API Key、仓库连接和编辑器偏好。"
        title="设置"
      />
      <AiApiKeySettings initialStatus={aiStatus} />
      <SettingsForm
        initialConfig={config}
        tokenConfigured={status.repositoryConfigured}
      />
    </>
  );
}
