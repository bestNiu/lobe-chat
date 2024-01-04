import CustomLogo from '@/app/chat/features/ChatHeader/ShareButton/CustomLogo';
import { Icon } from '@lobehub/ui';
import { Loader2 } from 'lucide-react';
import { memo } from 'react';
import { Center, Flexbox } from 'react-layout-kit';

const FullscreenLoading = memo<{ title?: string }>(({ title }) => {
  return (
    <Flexbox height={'100%'} width={'100%'}>
      <Center flex={1} gap={12} width={'100%'}>
        <CustomLogo customLogoUrl="/icons/icon-192x192.png" 
        extra={'萌鲸小秘'} size={48} type={'flat'} />
        <Center gap={16} horizontal>
          <Icon icon={Loader2} spin />
          {title}
        </Center>
      </Center>
    </Flexbox>
  );
});

export default FullscreenLoading;
