import { requireAdminApi } from "@/lib/auth-guard";
import { AppError, errorResponse } from "@/lib/errors";
import { isMediaReferenced } from "@/lib/media-usage";
import { getRepository } from "@/lib/repository";

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return results;
}

export async function GET(request: Request) {
  try {
    await requireAdminApi();
    const repository = await getRepository();
    const params = new URL(request.url).searchParams;
    if (params.get("usage") !== "1") {
      return Response.json({ data: await repository.listMedia() });
    }
    const [media, posts] = await Promise.all([
      repository.listMedia(),
      repository.listPosts(),
    ]);
    const documents = await mapWithConcurrency(posts, 6, (post) =>
      repository.getPost(post.path),
    );
    const usage = Object.fromEntries(
      media.map((item) => [
        item.path,
        documents
          .filter((document) => isMediaReferenced(document, item))
          .map((document) => ({
            kind: document.kind,
            slug: document.slug,
            title: document.title,
          })),
      ]),
    );
    return Response.json({ data: { usage } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminApi();
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new AppError("UPLOAD_INVALID", "请选择要上传的图片。", 400);
    }
    const postPath = formData.get("postPath");
    const repository = await getRepository();
    const media = await repository.uploadMedia({
      bytes: new Uint8Array(await file.arrayBuffer()),
      name: file.name,
      contentType: file.type,
      postPath: typeof postPath === "string" && postPath ? postPath : undefined,
    });
    return Response.json({ data: media }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdminApi();
    const params = new URL(request.url).searchParams;
    const path = params.get("path");
    const sha = params.get("sha");
    if (!path || !sha) {
      throw new AppError("VALIDATION", "缺少媒体路径或 SHA。", 400);
    }
    const repository = await getRepository();
    return Response.json({
      data: await repository.deleteMedia(path, sha),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
