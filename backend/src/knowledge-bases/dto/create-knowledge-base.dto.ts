import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateKnowledgeBaseDto {
  /** 知识库名称。 */
  @IsString()
  @IsNotEmpty({ message: '知识库名称不能为空' })
  @MaxLength(100, { message: '知识库名称不能超过 100 个字符' })
  name!: string;
}
