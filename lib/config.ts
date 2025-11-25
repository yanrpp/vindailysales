// System Configuration
// ค่าที่สามารถปรับแต่งได้จากระบบ

export interface SystemConfig {
  a_min: number; // Minimum multiplier
  b_max: number; // Maximum multiplier
  c_monthAvg: number; // Monthly average divisor
}

// Default configuration values
export const defaultConfig: SystemConfig = {
  a_min: 5,
  b_max: 10,
  c_monthAvg: 30,
};

// Get configuration (สามารถดึงจาก database หรือ environment variables ในอนาคต)
export function getConfig(): SystemConfig {
  // TODO: ในอนาคตสามารถดึงจาก database หรือ environment variables
  // ตอนนี้ใช้ default values
  return defaultConfig;
}

// Update configuration (สำหรับ admin ในอนาคต)
export function updateConfig(config: Partial<SystemConfig>): SystemConfig {
  // TODO: บันทึกลง database หรือ environment variables
  return { ...defaultConfig, ...config };
}

