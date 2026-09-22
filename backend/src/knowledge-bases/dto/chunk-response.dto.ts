export interface ChunkResponseDto {
  id: string;
  documentId: string;
  documentName: string;
  index: number;
  content: string;
  sectionPaths: string[][];
  tokenCount: number;
}
