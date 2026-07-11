import express from 'express';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Rate limiter for Copilot queries to prevent spam/abuse
const copilotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 requests per window
  message: { error: "Too many requests to Copilot, please try again later." }
});

router.post('/chat', copilotLimiter, async (req, res) => {
  try {
    const { messages, context } = req.body;

    // Build the enriched context as GitHub Copilot does
    const enrichedMessages = [
      { role: 'system', content: 'You are an expert coding assistant for my website, acting like GitHub Copilot.' },
      context ? { role: 'system', content: `Context (current file the user is viewing):\n\n${context}` } : null,
      ...messages
    ].filter(Boolean); // removes the null if no context was passed

    // Move headers lower so that if Ollama throws an error, Express doesn't crash on res.status()
    // We will set this AFTER the successful Ollama fetch connection.

    // Call local Ollama API
    // Ensure you have Ollama running locally and have run `ollama pull llama3.2`
    let ollamaResponse;
    try {
      ollamaResponse = await fetch('http://127.0.0.1:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama3.2', // Change this to your preferred local model
          messages: enrichedMessages,
          stream: true
        })
      });
    } catch (err) {
      console.error('Failed to connect to Ollama:', err.message);
      return res.status(502).json({ error: 'Cannot connect to Ollama. Please make sure the Ollama application is running on your machine.' });
    }

    if (!ollamaResponse.ok) {
        return res.status(ollamaResponse.status).json({ error: `Ollama Error: ${ollamaResponse.statusText}. Did you pull the llama3.2 model?` });
    }

    if (!ollamaResponse.body) {
        throw new Error('No body returned from Ollama');
    }

    // Set headers for SSE (Server-Sent Events) streaming back to React
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Node.js implementation for stream reading:
    const reader = ollamaResponse.body.getReader();
    const decoder = new TextDecoder('utf-8');

    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }

        // Decode the raw stream from Ollama
        const chunk = decoder.decode(value, { stream: true });
        
        // Ollama streams JSON lines
        const lines = chunk.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
            try {
                const parsed = JSON.parse(line);
                const content = parsed.message?.content || '';
                
                if (content) {
                    // Forward the chunk to the React frontend as an SSE event
                    res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
                }

                if (parsed.done) {
                    res.write('data: [DONE]\n\n');
                }
            } catch (e) {
                // Ignore incomplete JSON parsing errors
            }
        }
    }

    res.end();
  } catch (error) {
    console.error('Copilot Stream Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate answer from local model' });
    } else {
      res.end();
    }
  }
});

export default router;