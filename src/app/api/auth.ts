import { getServerConfig } from '@/config/server';
import { ChatErrorType } from '@/types/fetch';

interface AuthConfig {
  accessCode?: string | null;
  apiKey?: string | null;
}

export const checkAuth = ({ apiKey, accessCode }: AuthConfig) => {
  const { ACCESS_CODES } = getServerConfig();

  // if apiKey exist
  if (apiKey) {
    return { auth: true };
  }

  // if accessCode doesn't exist
  if (!ACCESS_CODES.length) return { auth: true };


  // Find the access code entry with its expiry date
  const accessCodeEntry = ACCESS_CODES.find((entry) => entry.code === accessCode);
  console.log("accessCodeEntry=="+accessCodeEntry);
  console.log("!accessCodeEntry.expiry==" + accessCodeEntry?.expiry);


  // Check if the access code exists and has not expired
  if (accessCodeEntry && (!accessCodeEntry.expiry || accessCodeEntry.expiry > new Date())) {
    console.log("InvalidAccessCode==1");
    return { auth: true };
    
  }else{
    console.log("InvalidAccessCode==2");
    return { auth: false, error: ChatErrorType.InvalidAccessCode };
  }

  /**
    if (!accessCode || !ACCESS_CODES.includes(accessCode)) {
      return { auth: false, error: ChatErrorType.InvalidAccessCode };
    }

    return { auth: true };
   */
  
};
