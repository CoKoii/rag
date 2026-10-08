export interface RetrievalResultDto {
  id: string;
  score: number;
  documentId: string;
  documentName: string;
  chunkId: string;
  index: number;
  content: string;
}
