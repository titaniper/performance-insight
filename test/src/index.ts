import { PerformanceManager } from '@jykang/performancejs';
import { DataSource } from "typeorm";
import * as dotenv from 'dotenv';

// .env 파일에서 환경 변수 로드
dotenv.config();

const dataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || "127.0.0.1",
  port: parseInt(process.env.DB_PORT || "3307"),
  database: process.env.DB_NAME || "payment",
  username: process.env.DB_USERNAME || "root",
  password: process.env.DB_PASSWORD || "1234",
  timezone: process.env.DB_TIMEZONE || 'UTC+0',
  synchronize: process.env.DB_SYNCHRONIZE === 'true',
});

async function example() {
    await dataSource.initialize();
    
    const performanceManager = new PerformanceManager("테스트", [{
        type: 'discord',
        credentials: {
            webhookUrl: process.env.DISCORD_WEBHOOK_URL!
        }
    }], [{
        type: 'grafana',
        url: 'http://localhost:3000',
        description: '이곳 보래요~'
    }]);

    try {
      const queryRunner = dataSource.createQueryRunner();
      // 데이터베이스 메트릭 로깅
      await performanceManager.report('조회입니다.', queryRunner);
    } catch (error) {
      console.error("오류 발생:", error);
    } finally {
      await dataSource.destroy();
    }
  }
  
  example();