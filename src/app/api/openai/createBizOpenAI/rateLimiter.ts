// rateLimiter.ts

type AccessRecord = {
  ip: string;
  timestamp: number;
};

type AccessCodeStore = {
  [key: string]: AccessRecord[];
};

// 一个简单的内存存储，仅用于示例目的
const accessCodeStore: AccessCodeStore = {};

/**
* 检查在过去一分钟内是否有多于一个IP使用了访问码。
* @param {string} accessCode
* @param {string} ip
* @returns {boolean}
*/
function checkAccessCodeUsage(accessCode: string, ip: string): boolean {
  const currentTime = Date.now();
  const oneMinuteAgo = currentTime - 60_000;

  if (!accessCodeStore[accessCode]) {
    accessCodeStore[accessCode] = [];
  }

  // 过滤掉一分钟前的所有记录
  accessCodeStore[accessCode] = accessCodeStore[accessCode].filter(({ timestamp }) => timestamp > oneMinuteAgo);

  // 检查当前IP是否在最后一分钟内已经使用过这个访问码
  const usedByCurrentIP = accessCodeStore[accessCode].some(record => record.ip === ip);

  // 如果当前IP已经使用了这个访问码，只更新时间戳
  if (usedByCurrentIP) {
    accessCodeStore[accessCode] = accessCodeStore[accessCode].map(record =>
      record.ip === ip ? { ip, timestamp: currentTime } : record
    );
    return false;
}

// 如果访问码已经被其他两个IP使用，返回true
if (accessCodeStore[accessCode].length >= 1) {
  return true;
}

// 否则，添加新的记录
accessCodeStore[accessCode].push({ ip, timestamp: currentTime });
return false;
}

export { checkAccessCodeUsage };
