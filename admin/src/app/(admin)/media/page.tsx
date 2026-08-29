import { PageHeader } from "@/components/page-header";
import { MediaLibrary } from "@/components/media/media-library";
import { getRepository } from "@/lib/repository";
import { getEffectiveRepositoryConfig } from "@/lib/settings";

export const metadata = { title: "媒体库" };

export default async function MediaPage() {
  const [repository, config] = await Promise.all([
    getRepository(),
    getEffectiveRepositoryConfig(),
  ]);
  const media = await repository.listMedia();
  return (
    <>
      <PageHeader
        description={`公共媒体写入 ${config.imagesPath}；编辑器上传写入文章同名资源目录。`}
        title="媒体库"
      />
      <MediaLibrary initialMedia={media} limitMb={config.uploadLimitMb} />
    </>
  );
}
