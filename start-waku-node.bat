@echo off

echo Starting local Waku node...
echo ============================

REM Check if Docker is installed
where docker >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Docker is not installed. Please install Docker Desktop first.
    echo Download link: https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)

REM Check if Docker is running
docker info >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Docker is not running. Please start Docker Desktop.
    pause
    exit /b 1
)

REM Start local Waku node
echo Pulling Waku image...
docker pull statusteam/nim-waku:latest

echo Starting Waku node...
REM 浏览器只能通过 WebSocket 连接，必须启用 websocket-support
docker run -d -p 60000:60000 -p 8000:8000 -p 9000:9000 -p 8545:8545 --name nim-waku statusteam/nim-waku:v0.20.0 ^
    --rpc --rpc-admin --rpc-port=8545 --rpc-address=0.0.0.0 ^
    --relay=true --filter=true --lightpush=true --store=true ^
    --topic=/waku/2/default-waku/proto ^
    --websocket-support=true --websocket-port=8000 ^
    --nodekey=0x7e89a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9

if %ERRORLEVEL% NEQ 0 (
    echo Failed to start Waku node. Please check Docker logs.
    pause
    exit /b 1
)

echo Waiting for node to log its address...
timeout /t 5 /nobreak >nul

echo ============================
echo Local Waku node started successfully!
echo.
echo Node address - use WebSocket for browser (copy to src/sdk/chat-sdk.ts localNode):
echo   Browser requires /ws/ multiaddr, e.g. /ip4/127.0.0.1/tcp/8000/ws/p2p/PEER_ID
docker logs nwaku 2>&1 | findstr /C:"/ip4/127" | findstr /C:"/p2p/"
echo.
echo RPC endpoint: http://localhost:8545
echo ============================
echo To stop the node: docker stop nwaku
echo To remove the node: docker rm nwaku
echo ============================
pause