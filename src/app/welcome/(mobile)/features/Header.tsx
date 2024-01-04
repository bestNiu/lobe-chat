import CustomLogo from '@/app/chat/features/ChatHeader/ShareButton/CustomLogo';
import {  MobileNavBar } from '@lobehub/ui';
import { memo } from 'react';

const Header = memo(() => <MobileNavBar center={<CustomLogo customLogoUrl="/icons/icon-192x192.png"
extra={'萌鲸小秘'} size={28} type={'text'} />} />);

export default Header;
