import CustomLogo from '@/app/chat/features/ChatHeader/ShareButton/CustomLogo';
import { MobileNavBar } from '@lobehub/ui';
import { memo } from 'react';

const Header = memo(() => {
  return <MobileNavBar center={<CustomLogo customLogoUrl="/icons/icon-192x192.png"
  extra={'萌鲸小秘'} type={'text'} />} />;
});

export default Header;
