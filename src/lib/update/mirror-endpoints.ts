/** 国内下载镜像。与 GitHub Actions secret `MIRROR_PUBLIC_BASE` 必须一致。 */
export const MIRROR_PUBLIC_BASE =
  "https://static-host-e3n8jbll-schedulemini.sealosgzg.site";

/** 桶内对象前缀，见 docs 里的目录约定。 */
export const MIRROR_OBJECT_PREFIX = "schedulemini";

export const GITHUB_LATEST_JSON_URL =
  "https://github.com/BIANG-qilie/ScheduleMINI/releases/latest/download/latest.json";

export const DESKTOP_MIRROR_LATEST_URL = `${MIRROR_PUBLIC_BASE}/${MIRROR_OBJECT_PREFIX}/latest.json`;

export const ANDROID_MIRROR_MANIFEST_URL = `${MIRROR_PUBLIC_BASE}/${MIRROR_OBJECT_PREFIX}/android-latest.json`;
