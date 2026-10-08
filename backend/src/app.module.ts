import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { loadEnvFile } from 'node:process';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { KnowledgeBasesModule } from './knowledge-bases/knowledge-bases.module.js';

try {
  loadEnvFile();
} catch {
  // 环境变量也可以由启动命令或部署平台提供。
}

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL ?? 'postgres://rag:rag@localhost:5432/rag',
      autoLoadEntities: true,
      synchronize: true,
    }),
    KnowledgeBasesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
