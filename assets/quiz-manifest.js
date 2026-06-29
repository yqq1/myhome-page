const publicManifestUrl = "data/quiz-manifest.json";
const privateManifestUrl = "data/private-quiz-manifest.json";
const privateAccessKey = "yq";

export async function loadQuizManifest() {
  const publicItems = await fetchManifest(publicManifestUrl, "无法读取题库索引");
  const privateMode = new URLSearchParams(window.location.search).get("private") === privateAccessKey;
  if (!privateMode) return { items: publicItems, privateMode };

  const privateItems = await fetchManifest(privateManifestUrl, "无法读取隐藏题库索引");
  return {
    items: [...publicItems, ...privateItems.map(markPrivateSet)],
    privateMode
  };
}

async function fetchManifest(url, errorMessage) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(errorMessage);
  return response.json();
}

function markPrivateSet(setMeta) {
  return {
    ...setMeta,
    private: true,
    badge: setMeta.badge ? `隐藏 · ${setMeta.badge}` : "隐藏题库"
  };
}
