import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useFemometer } from '@/contexts/FemometerContext';
import { DeviceStatusButtonView } from './DeviceStatusButtonView';
const DeviceStatusButton = () => <DeviceStatusButtonView ble={useFemometer()} navigate={useNavigate()} />;
export default DeviceStatusButton;
