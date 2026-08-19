import { ReactNode } from 'react';
import Modal from '../Modal';

interface IPromptDialogProps {
  title: string;
  show: boolean;
  onClose: () => void;
  children: ReactNode;
}

export default function PromptDialog({
  title = '',
  show = false,
  onClose = () => {},
  children,
}: IPromptDialogProps) {
  return (
    <Modal show={show} title={title} onClose={onClose} zIndex={111111}>
      {children}
    </Modal>
  );
}
