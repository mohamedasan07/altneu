import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import AuthField from '../AuthField/AuthField';
import styles from './ProfileCard.module.css';

const initialsOf = (user) => {
  const first = (user?.firstName || '').trim().charAt(0);
  const last = (user?.lastName || '').trim().charAt(0);
  return (first || last || 'U').toUpperCase() + (last || '');
};

const fieldName = (f, l) => `${(f || '').trim()} ${(l || '').trim()}`.trim();

/**
 * Premium account card — avatar placeholder, identity row, saved address and
 * inline edit mode. Logout is exposed here and in the navbar dropdown.
 */
export default function ProfileCard() {
  const { user, updateProfile, logout } = useAuth();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [draft, setDraft] = useState({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    phone: user?.phone ?? '',
  });

  const startEdit = () => {
    setDraft({
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      phone: user?.phone ?? '',
    });
    setSaveError('');
    setEditing(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await updateProfile({
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim(),
        phone: draft.phone.trim() || null,
      });
      setEditing(false);
    } catch (err) {
      setSaveError(err.message || 'Unable to save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <motion.div
      className={styles.card}
      role="region"
      aria-label="Your account"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <header className={styles.header}>
        <div className={styles.avatar} aria-hidden="true">
          {initialsOf(user)}
        </div>
        <div>
          <p className={styles.kicker}>Member</p>
          <h2 className={styles.name}>{fieldName(user?.firstName, user?.lastName) || 'ALTNEU Member'}</h2>
          <p className={styles.email}>{user?.email}</p>
        </div>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        {!editing ? (
          <motion.dl
            key="profile-view"
            className={styles.list}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className={styles.item}>
              <dt>Phone</dt>
              <dd>{user?.phone || 'Not added'}</dd>
            </div>
          </motion.dl>
        ) : (
          <motion.div
            key="profile-edit"
            className={styles.editor}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <div className={styles.editGrid}>
              <AuthField
                id="profile-first-name"
                label="First Name"
                type="text"
                value={draft.firstName}
                onChange={(e) => setDraft((d) => ({ ...d, firstName: e.target.value }))}
              />
              <AuthField
                id="profile-last-name"
                label="Last Name"
                type="text"
                value={draft.lastName}
                onChange={(e) => setDraft((d) => ({ ...d, lastName: e.target.value }))}
              />
            </div>
            <AuthField
              id="profile-phone"
              label="Phone"
              type="tel"
              value={draft.phone}
              onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
            />

            {saveError && (
              <p className={styles.saveError} role="alert">
                {saveError}
              </p>
            )}

            <div className={styles.editActions}>
              <button type="button" className={styles.save} onClick={saveEdit} disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
              <button type="button" className={styles.cancel} onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={styles.actions}>
        <button type="button" className={styles.edit} onClick={startEdit}>
          Edit Profile
        </button>
        <button type="button" className={styles.logout} onClick={handleLogout}>
          Logout
        </button>
      </div>
    </motion.div>
  );
}