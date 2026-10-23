export function isSupportedModelUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      /\.(?:glb|gltf)$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}
