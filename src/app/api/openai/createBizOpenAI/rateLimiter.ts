// rateLimiter.ts

type AccessRecord = {
    ip: string;
    timestamp: number;
  };
  
  type AccessCodeStore = {
    [key: string]: AccessRecord[];
  };
  
  // A simple in-memory store for example purposes
  const accessCodeStore: AccessCodeStore = {};
  
  /**
   * Check if the access code has been used by more than one IP in the last minute.
   * @param {string} accessCode
   * @param {string} ip
   * @returns {boolean}
   */
  function checkAccessCodeUsage(accessCode: string, ip: string): boolean {
    const currentTime = Date.now();
    const oneMinuteAgo = currentTime - 60000;
  
    if (!accessCodeStore[accessCode]) {
      accessCodeStore[accessCode] = [];
    }
  
    // Filter out any records older than one minute
    accessCodeStore[accessCode] = accessCodeStore[accessCode].filter(({ timestamp }) => timestamp > oneMinuteAgo);
  
    // Check if the current IP has already used this access code in the last minute
    const usedByCurrentIP = accessCodeStore[accessCode].some(record => record.ip === ip);
  
    // If the access code has been used by this IP, just update the timestamp
    if (usedByCurrentIP) {
      accessCodeStore[accessCode] = accessCodeStore[accessCode].map(record =>
        record.ip === ip ? { ip, timestamp: currentTime } : record
      );
      return false;
    }
  
    // If the access code has been used by two other IPs, return true
    if (accessCodeStore[accessCode].length >= 2) {
      return true;
    }
  
    // Otherwise, add the new record
    accessCodeStore[accessCode].push({ ip, timestamp: currentTime });
    return false;
  }
  
  export { checkAccessCodeUsage };
  