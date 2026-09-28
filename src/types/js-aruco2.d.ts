declare module "js-aruco2" {
  const aruco: {
    AR: {
      Detector: new (options?: {
        dictionaryName?: string;
        maxHammingDistance?: number;
      }) => {
        detect(imageData: ImageData): Array<{
          id: number;
          corners: Array<{ x: number; y: number }>;
        }>;
      };
    };
  };
  export default aruco;
}
