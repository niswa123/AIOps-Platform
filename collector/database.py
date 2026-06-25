import os
import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
import clickhouse_connect
import redis
from aiokafka import AIOKafkaProducer
from dotenv import load_file

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("aiops.database")

# Load environment
env_path = os.path.join(os.path.dirname(__file__), '.env')
if os.path.exists(env_path):
    # Proactively load variables using simple parser
    with open(env_path) as f:
        for line in f:
            if line.strip() and not line.startswith('#') and '=' in line:
                k, v = line.strip().split('=', 1)
                os.environ[k] = v

# PostgreSQL connection
POSTGRES_URL = os.getenv("POSTGRES_URL", "postgresql://postgres:postgrespassword@localhost:5432/aiops_development")
engine = create_engine(POSTGRES_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# ClickHouse connection
CLICKHOUSE_HOST = os.getenv("CLICKHOUSE_HOST", "localhost")
CLICKHOUSE_PORT = int(os.getenv("CLICKHOUSE_PORT", "8123"))
CLICKHOUSE_USER = os.getenv("CLICKHOUSE_USER", "default")
CLICKHOUSE_PASSWORD = os.getenv("CLICKHOUSE_PASSWORD", "")

ch_client = None
try:
    ch_client = clickhouse_connect.get_client(
        host=CLICKHOUSE_HOST,
        port=CLICKHOUSE_PORT,
        username=CLICKHOUSE_USER,
        password=CLICKHOUSE_PASSWORD
    )
    logger.info("Connected to ClickHouse successfully.")
except Exception as e:
    logger.warning(f"Could not connect to ClickHouse: {e}. Analytical queries will be mocked.")

# Redis connection
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
redis_client = None
try:
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    logger.info("Connected to Redis successfully.")
except Exception as e:
    logger.warning(f"Could not connect to Redis: {e}.")

# Kafka connection
KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
kafka_producer = None

async def init_kafka():
    global kafka_producer
    try:
        kafka_producer = AIOKafkaProducer(bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS)
        await kafka_producer.start()
        logger.info("Connected to Redpanda/Kafka successfully.")
    except Exception as e:
        logger.warning(f"Could not initialize Kafka: {e}. Messages will be processed synchronously.")
        kafka_producer = None

async def close_kafka():
    global kafka_producer
    if kafka_producer:
        await kafka_producer.stop()
