import { useEffect, useMemo, useState } from 'react'
import './App.css'
import CopilotPage from './CopilotPage'
import IDE from './IDE'

const API_BASE_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:5001`

function App() {
  const [page, setPage] = useState('signin')
  const [currentProjectId, setCurrentProjectId] = useState(null)
  const [token, setToken] = useState(localStorage.getItem('token') || '')
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('user')
    return saved ? JSON.parse(saved) : null
  })
  const [projects, setProjects] = useState([])
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' })
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    visibility: 'private',
    language: '',
    template: '',
  })
  const [inviteForm, setInviteForm] = useState({
    projectId: '',
    identifier: '',
    role: 'viewer',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const authHeaders = (activeToken) => ({
    Authorization: `Bearer ${activeToken}`,
    'Content-Type': 'application/json',
  })

  const normalizeUser = (user) => ({
    id: user.id,
    name: user.display_name || user.username,
    email: user.email,
    username: user.username,
  })

  const generateUsername = (name, email) => {
    const base = (name || email.split('@')[0] || 'user')
      .trim()
      .toLowerCase()
      .replaceAll(/[^a-z0-9]/g, '')
    return `${base || 'user'}${Date.now().toString().slice(-5)}`
  }

  const loadProjects = async (activeToken = token) => {
    if (!activeToken) return

    try {
      const response = await fetch(`${API_BASE_URL}/api/projects`, {
        headers: authHeaders(activeToken),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Unable to load projects')
      }

      setProjects(data)
    } catch (apiError) {
      setError(apiError.message)
    }
  }

  useEffect(() => {
    if (token && currentUser) {
      loadProjects(token)
      setPage('dashboard')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const myProjects = useMemo(() => {
    if (!currentUser) return []

    return projects.filter((project) => !!project.ProjectMember && project.ProjectMember.status === 'accepted')
  }, [projects, currentUser])

  const myInvitations = useMemo(() => {
    if (!currentUser) return []

    return projects.filter((project) => !!project.ProjectMember && project.ProjectMember.status === 'pending')
  }, [projects, currentUser])

  const myMemberships = useMemo(() => {
    if (!currentUser) return []

    return myProjects.map((project) => {
      const me = (project.Users || []).find((member) => member.id === currentUser.id)
      return {
        projectId: project.id,
        projectName: project.name,
        role: me?.ProjectMember?.role || 'viewer',
      }
    })
  }, [myProjects, currentUser])

  const resetAuthForm = () => {
    setAuthForm({ name: '', email: '', password: '' })
  }

  const handleSignIn = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: authForm.email,
          password: authForm.password,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.message || 'Email ou mot de passe invalide.')
      }

      const loggedUser = normalizeUser(data.user)
      setToken(data.token)
      setCurrentUser(loggedUser)
      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(loggedUser))
      await loadProjects(data.token)
      resetAuthForm()
      setPage('dashboard')
    } catch (apiError) {
      setError(apiError.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSignUp = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const registerResponse = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: generateUsername(authForm.name, authForm.email),
          display_name: authForm.name,
          email: authForm.email,
          password: authForm.password,
        }),
      })

      const registerData = await registerResponse.json()
      if (!registerResponse.ok) {
        throw new Error(registerData.message || 'Unable to register')
      }

      const loginResponse = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: authForm.email,
          password: authForm.password,
        }),
      })

      const loginData = await loginResponse.json()
      if (!loginResponse.ok) {
        throw new Error(loginData.message || 'Unable to login after register')
      }

      const loggedUser = normalizeUser(loginData.user)
      setToken(loginData.token)
      setCurrentUser(loggedUser)
      localStorage.setItem('token', loginData.token)
      localStorage.setItem('user', JSON.stringify(loggedUser))
      await loadProjects(loginData.token)
      resetAuthForm()
      setPage('dashboard')
    } catch (apiError) {
      setError(apiError.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateProject = async (event) => {
    event.preventDefault()
    setError('')

    if (!currentUser || !token) return

    try {
      const response = await fetch(`${API_BASE_URL}/api/projects`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name: newProject.name,
          description: newProject.description,
          visibility: newProject.visibility,
          language: newProject.language,
          template: newProject.template,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.message || 'Unable to create project')
      }

      setNewProject({
        name: '',
        description: '',
        visibility: 'private',
        language: '',
        template: '',
      })
      await loadProjects(token)
      setPage('dashboard')
    } catch (apiError) {
      setError(apiError.message)
    }
  }

  const handleInvite = async (event) => {
    event.preventDefault()
    setError('')

    if (!currentUser || !token) return

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/projects/${inviteForm.projectId}/invite`,
        {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({
            identifier: inviteForm.identifier,
            role: inviteForm.role,
          }),
        },
      )

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.message || 'Unable to invite user')
      }

      setInviteForm({ projectId: '', identifier: '', role: 'viewer' })
      await loadProjects(token)
      setPage('dashboard')
    } catch (apiError) {
      setError(apiError.message)
    }
  }

  const handleRejectInvite = async (projectId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}/reject`, {
        method: 'POST',
        headers: authHeaders(token)
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Unable to reject invite')
      }
      await loadProjects(token)
    } catch (apiError) {
      setError(apiError.message)
    }
  }

  const handleAcceptInvite = async (projectId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}/accept`, {
        method: 'POST',
        headers: authHeaders(token)
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Unable to accept invite')
      }
      await loadProjects(token)
    } catch (apiError) {
      setError(apiError.message)
    }
  }

  const signOut = async () => {
    if (token) {
      try {
        await fetch(`${API_BASE_URL}/api/auth/logout`, {
          method: 'POST',
          headers: authHeaders(token),
        })
      } catch {
        // Ignore logout API failure and continue local sign out.
      }
    }

    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setToken('')
    setCurrentUser(null)
    setProjects([])
    setPage('signin')
    setError('')
  }

  if (page === 'signin') {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>Sign in</h1>
          <form onSubmit={handleSignIn}>
            <label>
              <span>Email</span>
              <input
                type="email"
                required
                value={authForm.email}
                onChange={(e) =>
                  setAuthForm((prev) => ({ ...prev, email: e.target.value }))
                }
              />
            </label>
            <label>
              <span>Password</span>
              <input
                type="password"
                required
                value={authForm.password}
                onChange={(e) =>
                  setAuthForm((prev) => ({ ...prev, password: e.target.value }))
                }
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={loading}>
              {loading ? 'Please wait...' : 'Sign in'}
            </button>
          </form>
          <p className="switch-auth">
            New here ?{' '}
            <button type="button" onClick={() => setPage('signup')}>
              Create an account
            </button>
          </p>
        </section>
      </main>
    )
  }

  if (page === 'signup') {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>Sign up</h1>
          <form onSubmit={handleSignUp}>
            <label>
              <span>Full name</span>
              <input
                type="text"
                required
                value={authForm.name}
                onChange={(e) =>
                  setAuthForm((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </label>
            <label>
              <span>Email</span>
              <input
                type="email"
                required
                value={authForm.email}
                onChange={(e) =>
                  setAuthForm((prev) => ({ ...prev, email: e.target.value }))
                }
              />
            </label>
            <label>
              <span>Password</span>
              <input
                type="password"
                required
                value={authForm.password}
                onChange={(e) =>
                  setAuthForm((prev) => ({ ...prev, password: e.target.value }))
                }
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={loading}>
              {loading ? 'Please wait...' : 'Create account'}
            </button>
          </form>
          <p className="switch-auth">
            Have an account ?{' '}
            <button type="button" onClick={() => setPage('signin')}>
              Sign in
            </button>
          </p>
        </section>
      </main>
    )
  }

  if (!currentUser) return null

  if (page === 'ide' && currentProjectId) {
    return (
      <IDE 
        projectId={currentProjectId} 
        token={token} 
        currentUser={currentUser}
        onBack={() => setPage('dashboard')} 
      />
    )
  }

  if (page === 'profile') {
    return (
      <main className="profile-page">
        <section className="profile-shell">
          <aside className="profile-card">
            <div className="profile-avatar">DEV</div>
            <h2>{currentUser.name}</h2>
            <p className="role-badge">Collaborator</p>
            <div className="profile-meta">
              <p>
                <span>Email</span>
                {currentUser.email}
              </p>
            </div>
          </aside>

          <section className="profile-content">
            <div className="about-panel">
              <button
                type="button"
                className="secondary profile-back-action"
                onClick={() => setPage('dashboard')}
              >
                Dashboard
              </button>
              <h1>About Me</h1>
              <p className="muted">
                Profil utilisateur charge depuis le backend et conserve en session.
              </p>
            </div>
          </section>
        </section>
      </main>
    )
  }

  return (
    <main className="dashboard-page">
      <header className="topbar">
        <div>
          <strong>Dashboard</strong>
          <p className="muted">Welcome, {currentUser.name}</p>
        </div>
        <div className="topbar-actions">
          <button type="button" onClick={() => setPage('new-project')}>
            New project
          </button>
          <button type="button" onClick={() => setPage('copilot')}>
            ✨ Copilot
          </button>
          <button type="button" onClick={() => setPage('invite')}>
            Invite member
          </button>
          <button type="button" onClick={() => setPage('profile')}>
            Profile
          </button>
          <button type="button" className="secondary" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <section className="dashboard-layout">
        <aside className="sidebar">
          <h2>Repositories / Projects</h2>
          <ul>
            {myProjects.map((project) => (
              <li key={project.id}>
                <strong>{project.name}</strong>
                <span>{project.template || project.language || 'no template'}</span>
              </li>
            ))}
          </ul>
        </aside>

        <section className="content">
          {page === 'dashboard' && (
            <>
      

              <h3>My memberships</h3>
              <table>
                <thead>
                  <tr>
                    <th>Project ID</th>
                    <th>Project Name</th>
                    <th>Role</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {myMemberships.map((membership) => (
                    <tr key={`${membership.projectId}-${membership.role}`}>
                      <td>{membership.projectId}</td>
                      <td>{membership.projectName}</td>
                      <td>{membership.role}</td>
                      <td>
                        <button 
                          className="small"
                          onClick={() => {
                            setCurrentProjectId(membership.projectId);
                            setPage('ide');
                          }}
                        >
                          Open IDE
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h3>Pending invitations</h3>
              {myInvitations.length === 0 ? (
                <p className="muted">No pending invitations.</p>
              ) : (
                <ul className="invitation-list">
                  {myInvitations.map((invitation) => (
                    <li key={invitation.id} style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '8px' }}>
                      <span><strong>{invitation.name}</strong> has invited you as {invitation.ProjectMember?.role}</span>
                      <button onClick={() => handleAcceptInvite(invitation.id)} className="small">Accept</button>
                      <button onClick={() => handleRejectInvite(invitation.id)} className="secondary small">Reject</button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {page === 'copilot' && (
            <>
              <h2>AI Assistant</h2>
              <p className="muted">Chat with your local AI model about your projects.</p>
              <CopilotPage currentFileCode={""} />
            </>
          )}

          {page === 'new-project' && (
            <>
              <h2>Create new project</h2>
              <form onSubmit={handleCreateProject} className="form-block">
                <label>
                  <span>Project name</span>
                  <input
                    type="text"
                    required
                    value={newProject.name}
                    onChange={(e) =>
                      setNewProject((prev) => ({ ...prev, name: e.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>Description</span>
                  <input
                    type="text"
                    value={newProject.description}
                    onChange={(e) =>
                      setNewProject((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>Visibility</span>
                  <select
                    value={newProject.visibility}
                    onChange={(e) =>
                      setNewProject((prev) => ({
                        ...prev,
                        visibility: e.target.value,
                      }))
                    }
                  >
                    <option value="private">private</option>
                    <option value="public">public</option>
                  </select>
                </label>
                <label>
                  <span>Language</span>
                  <input
                    type="text"
                    value={newProject.language}
                    onChange={(e) =>
                      setNewProject((prev) => ({ ...prev, language: e.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>Template / Docker image</span>
                  <input
                    type="text"
                    value={newProject.template}
                    onChange={(e) =>
                      setNewProject((prev) => ({ ...prev, template: e.target.value }))
                    }
                  />
                </label>
                <button type="submit">Create project</button>
              </form>
            </>
          )}

          {page === 'invite' && (
            <>
              <h2>Invite member to project</h2>
              <form onSubmit={handleInvite} className="form-block">
                <label>
                  <span>Select project</span>
                  <select
                    required
                    value={inviteForm.projectId}
                    onChange={(e) =>
                      setInviteForm((prev) => ({
                        ...prev,
                        projectId: e.target.value,
                      }))
                    }
                  >
                    <option value="">-- Choose a project --</option>
                    {myProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.id} - {project.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Member username or email</span>
                  <input
                    type="text"
                    required
                    value={inviteForm.identifier}
                    onChange={(e) =>
                      setInviteForm((prev) => ({ ...prev, identifier: e.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>Role</span>
                  <select
                    value={inviteForm.role}
                    onChange={(e) =>
                      setInviteForm((prev) => ({ ...prev, role: e.target.value }))
                    }
                  >
                    <option value="viewer">viewer</option>
                    <option value="editor">editor</option>
                  </select>
                </label>
                <button type="submit">Send invitation</button>
              </form>
            </>
          )}

          {error && <p className="error">{error}</p>}
        </section>
      </section>
    </main>
  )
}

export default App
