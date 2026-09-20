import { DocumentStatus } from '../entities/document.entity.js';

export interface DocumentResponseDto {
  id: string;
  name: string;
  status: DocumentStatus;
}
