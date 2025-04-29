import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Connection } from '@solana/web3.js';
import { TokenDetector } from '../lib/TokenDetector';
import { TradingEngine } from '../lib/TradingEngine';
import SettingsPanel from '../components/SettingsPanel';
import TokenList from '../components/TokenList';
import TradeHistory from '../components/TradeHistory';
import ActivityLog from '../components/ActivityLog';
import StatusIndicator from '../components/StatusIndicator';

// Initialize connection
const connection = new Connection(
  process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com',
  'confirmed'
);

const Dashboard = () => {
  const { connected, publicKey } = useWallet();
  
  // Bot state
  const [isRunning, setIsRunning] = useState(false);
  const [detectedTokens, setDetectedTokens] = useState([]);
  const [tradeHistory, setTradeHistory] = useState([]);
  const [logs, setLogs] = useState([]);
  
  // Settings
  const [settings, setSettings] = useState({
    tradeAmount: 0.1,
    maxSlippage: 5,
    autoTradeEnabled: false,
    minLiquidity: 1, // Minimum liquidity in SOL
    takeProfit: 50, // Take profit percentage
    stopLoss: 20, // Stop loss percentage
  });
  
  // References to our engines
  const [tokenDetector, setTokenDetector] = useState(null);
  const [tradingEngine, setTradingEngine] = useState(null);
  
  // Initialize engines
  useEffect(() => {
    const trading = new TradingEngine();
    setTradingEngine(trading);
    
    const detector = new TokenDetector(
      process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com',
      3000, // webhook port
      handleTokenDetected
    );
    setTokenDetector(detector);
    
    // Configure trading engine
    trading.setTradeConfig({
      tradeAmount: settings.tradeAmount,
      maxSlippage: settings.maxSlippage,
      autoTradeEnabled: settings.autoTradeEnabled,
    });
    
    // Cleanup on unmount
    return () => {
      stopBot();
      trading.cleanup();
    };
  }, []);
  
  // Update trading engine when settings change
  useEffect(() => {
    if (tradingEngine) {
      tradingEngine.setTradeConfig({
        tradeAmount: settings.tradeAmount,
        maxSlippage: settings.maxSlippage,
        autoTradeEnabled: settings.autoTradeEnabled,
      });
    }
  }, [settings, tradingEngine]);
  
  // Token detection handler
  const handleTokenDetected = (tokenMint: string, tokenInfo: any) => {
    const newToken = {
      mint: tokenMint,
      detectedAt: new Date().toISOString(),
      info: tokenInfo,
    };
    
    setDetectedTokens(prev => [newToken, ...prev]);
    addLog(`Detected new token: ${tokenMint}`);
    
    // If auto-trading is enabled, the trading engine will handle this
    // trading is triggered inside the TokenDetector class
  };
  
  // Start the bot
  const startBot = async () => {
    if (!connected) {
      addLog('Please connect your wallet first');
      return;
    }
    
    if (!tokenDetector || !tradingEngine) {
      addLog('Bot components not initialized');
      return;
    }
    
    try {
      // Initialize trading engine
      await tradingEngine.initialize();
      
      // Connect wallet to trading engine
      const walletConnected = await tradingEngine.connectWallet();
      if (!walletConnected) {
        addLog('Failed to connect wallet to trading engine');
        return;
      }
      
      // Start token detector
      await tokenDetector.start();
      
      setIsRunning(true);
      addLog('Bot started successfully');
    } catch (error) {
      console.error('Failed to start bot:', error);
      addLog(`Failed to start bot: ${error.message}`);
    }
  };
  
  // Stop the bot
  const stopBot = async () => {
    if (!tokenDetector) return;
    
    try {
      await tokenDetector.stop();
      setIsRunning(false);
      addLog('Bot stopped');
    } catch (error) {
      console.error('Failed to stop bot:', error);
      addLog(`Failed to stop bot: ${error.message}`);
    }
  };
  
  // Add log entry
  const addLog = (message: string) => {
    setLogs(prev => [
      `[${new Date().toLocaleTimeString()}] ${message}`,
      ...prev
    ].slice(0, 100)); // Keep only the latest 100 logs
  };
  
  // Update settings
  const updateSettings = (newSettings: any) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
    addLog('Settings updated');
  };
  
  // Execute manual trade
  const executeTrade = async (tokenMint: string) => {
    if (!tradingEngine) {
      addLog('Trading engine not initialized');
      return;
    }
    
    try {
      addLog(`Executing trade for token: ${tokenMint}`);
      const success = await tradingEngine.executeTrade(tokenMint, null);
      
      if (success) {
        addLog(`Trade executed successfully for: ${tokenMint}`);
        // Update trade history
        const updatedHistory = tradingEngine.getTradeHistory();
        setTradeHistory(updatedHistory);
      } else {
        addLog(`Trade failed for: ${tokenMint}`);
      }
    } catch (error) {
      console.error('Trade execution error:', error);
      addLog(`Trade execution error: ${error.message}`);
    }
  };
  
  return (
    

      
Solana Token Sniper Bot

      
      

        {/* Left sidebar */}
        

          

            
Wallet

            

              
            

            {connected && publicKey && (
              

                {publicKey.toString()}
              

            )}
          

          
          

            
Bot Controls

            
            
            

              {!isRunning ? (
                
                  Start Bot
                
              ) : (
                
                  Stop Bot
                
              )}
            

          

        

        
        {/* Main content */}
        

          

            
Detected Tokens

            
          

          
          

            
Activity Log

            
          

        

        
        {/* Right sidebar */}
        

          

            
Settings

            
          

          
          

            
Trade History

            
          

        

      

    

  );
};

export default Dashboard;
