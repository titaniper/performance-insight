import { QueryRunner } from "typeorm";
import axios from 'axios';

// TODO: 웹훅이 낫지 않을까?
type AlertConfig = {
    type: 'discord' | 'slack' | 'email';
    credentials: Record<string, any>;
}

type MonitorConfig = {
    type: 'grafana' | 'prometheus';
    url: string;
    description: string;
}

class PerformanceManager {
    private name: string;

    private integrationManager!: IntegrationManager;

    private monitorConfigs: MonitorConfig[];

    constructor(name: string, alertConfigs: AlertConfig[], monitorConfigs: MonitorConfig[]) {
        this.name = name;
        this.integrationManager = new IntegrationManager(alertConfigs);
        this.monitorConfigs = monitorConfigs;
    }

    async report(subject: string, queryRunner: QueryRunner) {
        const logQuery = async (query: string, description: string) => {
          console.log(`\n--- ${this.name}: ${subject} / ${description} ---`);
          try {
            const result = await queryRunner.query(query);
            const content = JSON.stringify(result, null, 2);
            console.log(JSON.stringify(result, null, 2));
            this.sendAlert(query, content);
          } catch (error) {
            console.error(`Error executing query: ${description}`, error);
          }
          
        };
      
        // 테이블 통계
        await logQuery("SELECT * FROM information_schema.INNODB_LOCK_WAITS", "현재 LOCK이 걸려 대기중인 정보");
        await logQuery("SELECT * FROM information_schema.INNODB_LOCKS", "LOCK을 건 정보");
        await logQuery("SELECT * FROM information_schema.INNODB_TRX", "LOCK을 걸고 있는 프로세스 정보");
        await logQuery("SHOW VARIABLES LIKE 'innodb_table_lock%'", "InnoDB 테이블 잠금 관련 변수");
        await logQuery("SHOW VARIABLES LIKE 'innodb_deadlock%'", "데드락 감지 관련 변수");
        await logQuery("SHOW VARIABLES LIKE 'innodb_lock%'", "InnoDB 잠금 관련 변수");
        await logQuery(`
          SELECT ID, USER, HOST, DB, COMMAND, TIME, STATE, INFO 
          FROM information_schema.PROCESSLIST 
          WHERE PROCESSLIST.STATE LIKE '%metadata lock%' 
          ORDER BY TIME DESC
        `, "메타데이터 잠금 관련 프로세스");
      
        await logQuery(`
          SELECT TABLE_NAME, TABLE_ROWS, AVG_ROW_LENGTH, DATA_LENGTH, INDEX_LENGTH
          FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE()
          ORDER BY DATA_LENGTH DESC
          LIMIT 10
        `, "Top 10 크기 테이블 통계");
        // TABLE_ROWS: 테이블의 대략적인 행 수
        // AVG_ROW_LENGTH: 평균 행 길이 (바이트)
        // DATA_LENGTH: 데이터 파일의 크기 (바이트)
        // INDEX_LENGTH: 인덱스 파일의 크기 (바이트)
      
        // 슬로우 쿼리 로그 설정 확인
        await logQuery("SHOW VARIABLES LIKE '%slow_query%'", "슬로우 쿼리 로그 설정");
        // slow_query_log: 슬로우 쿼리 로깅 활성화 여부 (ON/OFF)
        // slow_query_log_file: 슬로우 쿼리 로그 파일 위치
        // long_query_time: 슬로우 쿼리로 간주되는 실행 시간 임계값 (초)
      
        // 쿼리 캐시 상태
        await logQuery("SHOW STATUS LIKE '%Qcache%'", "쿼리 캐시 상태");
        // Qcache_hits: 쿼리 캐시 히트 수
        // Qcache_inserts: 쿼리 캐시에 추가된 쿼리 수
        // Qcache_queries_in_cache: 현재 캐시된 쿼리 수
        // Qcache_lowmem_prunes: 메모리 부족으로 캐시에서 제거된 쿼리 수
      
        // 연결 및 스레드 정보
        await logQuery("SHOW STATUS LIKE '%connection%'", "연결 관련 상태");
        // Connections: 서버에 대한 연결 시도 횟수
        // Max_used_connections: 동시에 사용된 최대 연결 수
        // Threads_connected: 현재 열려있는 연결 수
      
        await logQuery("SHOW STATUS LIKE '%thread%'", "스레드 관련 상태");
        // Threads_created: 생성된 스레드 수
        // Threads_running: 현재 실행 중인 스레드 수
      
        // 임시 테이블 사용 통계
        await logQuery("SHOW STATUS LIKE '%tmp%'", "임시 테이블 사용 통계");
        // Created_tmp_disk_tables: 디스크에 생성된 임시 테이블 수
        // Created_tmp_tables: 메모리에 생성된 임시 테이블 수
      
        // 버퍼 풀 상태
        await logQuery("SHOW STATUS LIKE '%buffer pool%'", "버퍼 풀 상태");
        // Innodb_buffer_pool_pages_total: 버퍼 풀의 총 페이지 수
        // Innodb_buffer_pool_pages_free: 버퍼 풀의 여유 페이지 수
        // Innodb_buffer_pool_read_requests: 버퍼 풀 읽기 요청 수
        // Innodb_buffer_pool_reads: 디스크에서 직접 읽은 횟수
      
        // 테이블 잠금 상태
        await logQuery("SHOW STATUS LIKE '%table_locks%'", "테이블 잠금 상태");
        // Table_locks_immediate: 즉시 획득한 테이블 잠금 수
        // Table_locks_waited: 잠금을 기다려야 했던 횟수
      
        // 파일 디스크립터 사용량
        await logQuery("SHOW VARIABLES LIKE '%open_files_limit%'", "최대 오픈 파일 수");
        // open_files_limit: 동시에 열 수 있는 최대 파일 수
      
        await logQuery("SHOW STATUS LIKE '%open_files%'", "현재 오픈된 파일 수");
        // Open_files: 현재 열려있는 파일 수
      
        // InnoDB 트랜잭션 상태
        await logQuery("SHOW ENGINE INNODB STATUS", "InnoDB 엔진 상태");
        // 이 쿼리는 InnoDB 엔진의 상세한 상태 정보를 제공합니다.
        // 트랜잭션, 데드락, 버퍼 풀, I/O 활동 등 다양한 정보가 포함됩니다.
      
        // 현재 실행 중인 쿼리 목록
        await logQuery(`
          SELECT ID, USER, HOST, DB, COMMAND, TIME, STATE, INFO
          FROM information_schema.PROCESSLIST
          WHERE COMMAND != 'Sleep'
          ORDER BY TIME DESC
        `, "현재 실행 중인 쿼리");
        // ID: 연결 ID
        // USER: 사용자 이름
        // HOST: 클라이언트 호스트
        // DB: 현재 데이터베이스
        // COMMAND: 현재 명령 (예: Query, Sleep)
        // TIME: 명령이 실행된 시간 (초)
        // STATE: 쿼리의 현재 상태
        // INFO: 실행 중인 쿼리 텍스트
    }
    
    private async sendAlert(title: string, message: string) {
        return this.integrationManager.sendAlert(title, message, 'error');
    }

}

type AlertMessage = {
    title: string;
    message: string;
    type: 'error' | 'warning' | 'info';
}

class IntegrationManager {
    private alertConfigs: AlertConfig[];
    private discordBuffer: AlertMessage[] = [];
    private bufferTimeout: NodeJS.Timeout | null = null;

    constructor(alertConfigs: AlertConfig[]) {
        this.alertConfigs = alertConfigs;
    }

    async sendAlert(title: string, message: string, type: 'error' | 'warning' | 'info') {
        const alertMessage: AlertMessage = { title, message, type };

        for (const alertConfig of this.alertConfigs) {
            switch (alertConfig.type) {
                case 'discord':
                    this.bufferDiscordAlert(alertMessage);
                    break;
                case 'slack':
                    await this.sendSlackAlert(message);
                    break;
                case 'email':
                    await this.sendEmail(message);
                    break;
                default:
                    throw new Error(`Unsupported alert type: ${alertConfig.type}`);
            }
        }
    }

    private bufferDiscordAlert(alertMessage: AlertMessage) {
        this.discordBuffer.push(alertMessage);

        if (!this.bufferTimeout) {
            this.bufferTimeout = setTimeout(() => {
                this.sendBufferedDiscordAlerts();
            }, 1000); // 5초 후에 버퍼된 메시지 전송
        }
    }

    private async sendBufferedDiscordAlerts() {
        if (this.discordBuffer.length === 0) return;

        const config = this.alertConfigs.find((config) => config.type === 'discord');
        if (!config) return;

        const embeds = this.discordBuffer.map(alert => ({
            title: alert.title,
            description: alert.message,
            // color: this.getColorForAlertType(alert.type),
        }));

        try {
            await axios.post(config.credentials.webhookUrl, { embeds });
            console.log(`Sent ${this.discordBuffer.length} Discord alerts`);
        } catch (error) {
            console.error('Error sending Discord alerts:', error);
        }

        this.discordBuffer = [];
        this.bufferTimeout = null;
    }

    private getColorForAlertType(type: 'error' | 'warning' | 'info'): number {
        switch (type) {
            case 'error': return 16711680; // Red
            case 'warning': return 16776960; // Yellow
            case 'info': return 65535; // Blue
            default: return 0; // Black
        }
    }

    private async sendSlackAlert(message: string) {
        // Slack alert implementation
    }

    private async sendEmail(message: string) {
        // Email alert implementation
    }
}


export {PerformanceManager};