import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

interface DBConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean | { rejectUnauthorized: boolean };
}

export class DBHelper {
  private static instance: DBHelper;
  private pool: Pool;
  private dbConfig: DBConfig;

  private constructor() {
    this.dbConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME || 'postgres',
      user: process.env.DB_USER || '',
      password: process.env.DB_PASSWORD || '',
      ssl: process.env.DB_SSL === 'true'
        ? { rejectUnauthorized: false }
        : false,
    };

    this.pool = new Pool({
      ...this.dbConfig,
      max: 10,                  // max connections
      idleTimeoutMillis: 30000, // close idle connections
      connectionTimeoutMillis: 60000,
      allowExitOnIdle: false
    });
  }

  /**
   * Singleton instance
   */
  public static getInstance(): DBHelper {
    if (!DBHelper.instance) {
      DBHelper.instance = new DBHelper();
    }
    return DBHelper.instance;
  }

  /**
   * Get DB connection from pool
   */
  public async getDBConnection(): Promise<PoolClient> {
    if(!this.pool) {
        this.pool = new Pool(this.dbConfig);
        const client = await this.pool.connect();
        console.log('----- ✅ DB connection has been established! -----');
        return client;
    } else {
      return await this.pool.connect();
    } 
  }

  /**
   * Execute SQL query
   */
  public async executeQuery<T extends QueryResultRow = any>(
    query: string,
    params: any[] = []
  ): Promise<QueryResult<T>> {
    let client: PoolClient | undefined = undefined;
    try {
      client = await this.getDBConnection();
      return await client.query<T>(query, params);
    } catch (error) {
      console.error('❌ DB query failed:', { query, params, error });
      throw error;
    } finally {
        if(client) {
            this.releaseDBConnection(client);
            this.closeDBConnection();
        }
    }
  }

  /**
   * Release DB connection back to pool
   */
  public releaseDBConnection(client: PoolClient | null): void {
    if (client) {
      client.release();
      console.log('----- ✅ DB connection has been released! -----');
    }
  }

  /**
   * Close all DB connections
   * Call this in AfterAll hook
   */
  public async closeDBConnection(): Promise<void> {
    if(this.pool) {
      await this.pool.end();
      console.log('----- ✅ DB connection has been closed! -----');
    } 
  }


  /**
   * Execute a query
   */
  async getAllRows(query: string, params?: any[]): Promise<any[]> {
    let client: PoolClient | undefined = undefined;
    try {
      client = await this.getDBConnection();
      const result = (await client.query(query, params)).rows;
      return result;
    } catch (error) {
      console.error('❌ DB query failed:', { query, params, error });
      throw error;
    } finally {
      if (client) {
        this.releaseDBConnection(client);
        this.closeDBConnection();
      }
    }
  }

  /**
   * Execute a single query and return first row
   */
  async executeQuerySingle(query: string, params?: any[]): Promise<any> {
    const results = await this.getAllRows(query, params);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Verify record exists
   */
  async verifyRecordExists(tableName: string, whereClause: string): Promise<boolean> {
    const query = `SELECT COUNT(*) AS count FROM ${tableName} WHERE ${whereClause}`;
    const result = await this.executeQuerySingle(query);
    return result && result.count > 0;
  }

  /**
   * Get records by condition
   */
  async getRecords(tableName: string, whereClause?: string, columns: string = '*'): Promise<any[]> {
    let query = `SELECT ${columns} FROM ${tableName}`;
    if (whereClause) {
      query += ` WHERE ${whereClause}`;
    }
    return await this.getAllRows(query);
  }

  /**
   * Insert record
   */
  async insertRecord(tableName: string, data: Record<string, any>): Promise<any> {
    const columns = Object.keys(data).join(', ');
    const values = Object.values(data);
    const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');

    const query = `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders}) RETURNING *`;
    const result = await this.getAllRows(query, values);
    return result[0];
  }

  /**
   * Update record
   */
  async updateRecord(tableName: string, data: Record<string, any>, whereClause: string): Promise<any[]> { 
    const setClause = Object.keys(data)
      .map((key, index) => `${key} = $${index + 1}`)
      .join(', '); 
    const values = Object.values(data);
    const query = `UPDATE ${tableName} SET ${setClause} WHERE ${whereClause} RETURNING *`;
    return await this.getAllRows(query, values);
  }

  /**
   * Delete record
   */
  async deleteRecord(tableName: string, whereClause: string): Promise<number> {
    const query = `DELETE FROM ${tableName} WHERE ${whereClause}`;
    const result = await this.executeQuerySingle(query);
    return result.rowCount;
  }

}
