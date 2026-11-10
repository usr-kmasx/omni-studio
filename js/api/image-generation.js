export const imageDefaults = {
  imageWidth: '512', imageHeight: '512', imageSteps: '20', imageNegative: '',
  imageSeed: '', imageCfg: '', imageSampler: '', imageSigmas: '',
};

export function imageGenerationPayload(fields = {}) {
  const values = { ...imageDefaults, ...fields };
  const number = (name, min, max, whole = true) => {
    const input = values[name];
    const value = Number(input);
    if (String(input).trim() === '' || !Number.isFinite(value) || (whole && !Number.isInteger(value)) || value < min || value > max) {
      throw new RangeError(name);
    }
    return value;
  };
  const payload = {
    width: number('imageWidth', 1, 2147483647),
    height: number('imageHeight', 1, 2147483647),
    steps: number('imageSteps', 1, 100),
  };
  if (values.imageSeed !== '') payload.seed = number('imageSeed', 0, 4294967295);
  if (values.imageCfg !== '') payload.cfg = number('imageCfg', 0, 30, false);
  if (values.imageNegative.trim()) payload.negativePrompt = values.imageNegative.trim();
  if (values.imageSampler) payload.sampler = values.imageSampler;
  if (values.imageSigmas.trim()) payload.sigmas = values.imageSigmas.trim();
  return payload;
}

export function imageFields(saved) {
  if (!saved) return { ...imageDefaults };
  const map = {
    imageWidth: 'width', imageHeight: 'height', imageSteps: 'steps',
    imageNegative: 'negativePrompt', imageSeed: 'seed', imageCfg: 'cfg',
    imageSampler: 'sampler', imageSigmas: 'sigmas',
  };
  return Object.fromEntries(Object.entries(map).map(([field, key]) => [
    field, saved[key] == null ? imageDefaults[field] : String(saved[key]),
  ]));
}

export function textModelConversation(conversation) {
  return conversation.filter((message) => !message.imageTurn);
}
