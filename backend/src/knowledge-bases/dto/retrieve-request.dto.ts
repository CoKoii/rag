import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class RetrieveRequestDto {
  @IsString()
  @IsNotEmpty({ message: '请输入检索问题' })
  query!: string;

  @IsOptional()
  @IsInt({ message: '返回数量必须是整数' })
  @Min(1, { message: '返回数量必须大于 0' })
  topK?: number;
}
