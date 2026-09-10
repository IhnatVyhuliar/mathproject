import Modal from './Modal.jsx'

export default function ConfirmDialog({ title, message, confirmLabel = 'Usuń', onConfirm, onClose }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Anuluj
          </button>
          <button
            className="btn btn-primary btn-danger"
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="confirm-msg">{message}</p>
    </Modal>
  )
}
