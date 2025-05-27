import { useState, useEffect, useCallback } from 'react';

    export const useFullScreen = () => {
      const [isFullScreen, setIsFullScreen] = useState(false);

      const toggleFullScreen = useCallback(async () => {
        const element = document.documentElement;
        if (!isFullScreen) {
          try {
            if (element.requestFullscreen) {
              await element.requestFullscreen();
            } else if (element.mozRequestFullScreen) { 
              await element.mozRequestFullScreen();
            } else if (element.webkitRequestFullscreen) { 
              await element.webkitRequestFullscreen();
            } else if (element.msRequestFullscreen) { 
              await element.msRequestFullscreen();
            }
            if (typeof window !== 'undefined' && window.screen && window.screen.orientation && window.screen.orientation.lock) {
              await window.screen.orientation.lock('landscape-primary').catch(() => {});
            }
          } catch (error) {
            // console.error("Error entering fullscreen or locking orientation:", error);
          }
        } else {
          try {
            if (document.exitFullscreen) {
              await document.exitFullscreen();
            } else if (document.mozCancelFullScreen) { 
              await document.mozCancelFullScreen();
            } else if (document.webkitExitFullscreen) { 
              await document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) { 
              await document.msExitFullscreen();
            }
            if (typeof window !== 'undefined' && window.screen && window.screen.orientation && window.screen.orientation.unlock) {
              window.screen.orientation.unlock();
            }
          } catch (error) {
            // console.error("Error exiting fullscreen or unlocking orientation:", error);
          }
        }
      }, [isFullScreen]);

      useEffect(() => {
        const handleFullScreenChange = () => {
          const isCurrentlyFullScreen = !!(
            document.fullscreenElement || 
            document.webkitIsFullScreen || 
            document.mozFullScreenElement || 
            document.msFullscreenElement
          );
          setIsFullScreen(isCurrentlyFullScreen);
          if (!isCurrentlyFullScreen && typeof window !== 'undefined' && window.screen && window.screen.orientation && window.screen.orientation.unlock) {
            window.screen.orientation.unlock();
          }
        };
    
        document.addEventListener('fullscreenchange', handleFullScreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullScreenChange);
        document.addEventListener('mozfullscreenchange', handleFullScreenChange);
        document.addEventListener('MSFullscreenChange', handleFullScreenChange);
    
        return () => {
          document.removeEventListener('fullscreenchange', handleFullScreenChange);
          document.removeEventListener('webkitfullscreenchange', handleFullScreenChange);
          document.removeEventListener('mozfullscreenchange', handleFullScreenChange);
          document.removeEventListener('MSFullscreenChange', handleFullScreenChange);
        };
      }, []);

      return { isFullScreen, toggleFullScreen };
    };