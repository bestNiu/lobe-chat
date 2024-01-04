import { memo, useEffect } from 'react';

const PageTitle = memo<{ title: string }>(({ title }) => {
  useEffect(() => {
    document.title = title ? `${title} · MengJing` : 'MengJing';
  }, [title]);

  return null;
});

export default PageTitle;
