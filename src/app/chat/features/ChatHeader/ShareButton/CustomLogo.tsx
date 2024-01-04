import React, { ReactNode } from 'react';
import Logo, { LogoProps } from '@lobehub/ui';

// 扩展LogoProps来添加新的属性
export interface CustomLogoProps extends LogoProps {
    /**
     * @description Custom logo URL
     */
    customLogoUrl?: string;
}

// 创建一个新的CustomLogo组件
const CustomLogo: React.FC<CustomLogoProps> = ({ customLogoUrl, size, type, extra, ...divProps }) => {
    // 自定义逻辑来渲染不同的logo
    const renderCustomLogo = () => {
        if (customLogoUrl) {
            return <img src={customLogoUrl} alt="Custom Logo" style={{ width: size, height: size }} />;
        }
        // 如果没有提供customLogoUrl，就回退到默认的Logo组件
        return <Logo size={size} type={type} extra={extra} {...divProps} />;
    };

    return (
        <div {...divProps}>
            {renderCustomLogo()}
            {extra}
        </div>
    );
};

export default CustomLogo;
