import React, { useState, useRef, useEffect } from 'react';

export default function CopilotPage({ currentFileCode = '' }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef(null);

  // Auto-scroll to the bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = { role: 'user', content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    // Add a placeholder message for the AI response
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}:5001`}/api/copilot/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Include Authorization header if your route requires it:
          // 'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          messages: newMessages,
          context: currentFileCode // Sends the active code context to the backend
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP Error ${response.status}`);
      }

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        
        // Split chunk into individual SSE messages (they end with \n\n)
      const lines = chunk.split('\n\n').filter((line) => line.trim() !== '');
      
      for (const line of lines) {
        if (line === 'data: [DONE]') break;
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.replace('data: ', ''));
            // Append the token to the latest assistant message
            setMessages((prev) => {
              const updated = [...prev];
              const lastIndex = updated.length - 1;
              updated[lastIndex] = {
                ...updated[lastIndex],
                content: updated[lastIndex].content + data.text
              };
              return updated;
            });
          } catch (e) {
            console.error("JSON Error parsing data:", e);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error fetching stream:', error);
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: `${error.message || 'Sorry, I encountered an error. Please check your console.'}` }
    ]);
  } finally {
    setIsLoading(false);
  }
  };

  return (
    <div className="copilot-container">
      <div className="copilot-header">
        <h3>Copilot Chat</h3>
        <p>Context: {currentFileCode ? 'Active File' : 'No File Selected'}</p>
      </div>
      
      <div className="copilot-messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="empty-state">Ask me anything about your code!</div>
        )}
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.role}`}>
            <strong>{msg.role === 'user' ? 'You' : 'Copilot'}</strong>
            <pre className="message-content">{msg.content}</pre>
          </div>
        ))}
        {isLoading && messages[messages.length - 1]?.content === '' && (
          <div className="message assistant loading">...thinking</div>
        )}
      </div>

      <form onSubmit={sendMessage} className="copilot-input-form">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Copilot a question..."
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading || !input.trim()}>
          Send
        </button>
      </form>

      <style>{`
        .copilot-container {
          display: flex;
          flex-direction: column;
          height: 500px;
          border: 1px solid #dee2e6;
          border-radius: 8px;
          background: #f8f9fa;
          font-family: system-ui, -apple-system, sans-serif;
        }
        .copilot-header {
          padding: 12px 16px;
          background: #fff;
          border-bottom: 1px solid #dee2e6;
          border-radius: 8px 8px 0 0;
        }
        .copilot-header h3 { margin: 0; font-size: 16px; }
        .copilot-header p { margin: 4px 0 0; font-size: 12px; color: #6c757d; }
        .copilot-messages {
          flex: 1;
          padding: 16px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .message {
          max-width: 85%;
          padding: 12px;
          border-radius: 8px;
        }
        .message.user {
          align-self: flex-end;
          background: #0d6efd;
          color: white;
        }
        .message.assistant {
          align-self: flex-start;
          background: #fff;
          border: 1px solid #dee2e6;
        }
        .message-content {
          margin: 4px 0 0;
          white-space: pre-wrap;
          font-family: monospace;
          font-size: 13px;
        }
        .copilot-input-form {
          display: flex;
          padding: 12px;
          background: #fff;
          border-top: 1px solid #dee2e6;
          border-radius: 0 0 8px 8px;
        }
        .copilot-input-form input {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid #dee2e6;
          border-radius: 4px;
          margin-right: 8px;
        }
        .copilot-input-form button {
          padding: 8px 16px;
          background: #0d6efd;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        .copilot-input-form button:disabled { background: #6c757d; }
      `}</style>
    </div>
  );
}
