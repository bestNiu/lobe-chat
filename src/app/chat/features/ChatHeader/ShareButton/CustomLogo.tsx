import React from 'react';
import Image from 'next/image';
import { LogoProps } from '@lobehub/ui';

// 扩展LogoProps来添加新的属性
export interface CustomLogoProps extends LogoProps {
    /**
     * @description Custom logo URL
     */
    customLogoUrl?: string;

    /**
     * @description Background color when no custom logo URL is provided
     */
    backgroundColor?: string; // Make this optional
}

// 创建一个新的CustomLogo组件
const CustomLogo: React.FC<CustomLogoProps> = ({ backgroundColor = 'transparent',customLogoUrl, size, type, extra, ...divProps }) => {
    // 自定义逻辑来渲染不同的logo
    const renderCustomLogo = () => {
        if (customLogoUrl) {
            // Make sure the props are sorted alphabetically
            return <Image alt="MengJing" height={size} src={customLogoUrl} width={size} />;
        } else {
            const bg = backgroundColor || 'transparent'; // Provide a default value here
            // Set a div with a background color if customLogoUrl is not provided
            return (
                <div style={{ backgroundColor:bg, height: size ,width: size }}>
                    {/* You can include a default logo or any placeholder content here */}
                </div>
            );
        }
        // Make sure the props are sorted alphabetically
        // return <Logo extra={extra} size={size} type={type} {...divProps} />;
    };

    return (
        <div {...divProps}style={{
            alignItems: 'center', // Center items vertically
            display: 'flex', // Apply flex layout
            ...divProps.style
            
          }}
        >
            {renderCustomLogo()}
            {extra}
        </div>
    );
};

export default CustomLogo;
