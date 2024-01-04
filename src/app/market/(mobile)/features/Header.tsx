import { MobileNavBar } from '@lobehub/ui';
import { memo } from 'react';

import ShareAgentButton from '../../features/ShareAgentButton';
import CustomLogo from '@/app/chat/features/ChatHeader/ShareButton/CustomLogo';

const Header = memo(() => {
  return <MobileNavBar center={<CustomLogo customLogoUrl="/icons/icon-192x192.png"
  extra={'萌鲸小秘'} type={'text'} />} right={<ShareAgentButton mobile />} />;
});

export default Header;
